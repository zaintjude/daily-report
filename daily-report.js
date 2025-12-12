import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load .env only when NOT in GitHub Actions
if (process.env.GITHUB_ACTIONS !== "true") {
  dotenv.config();
}

// --- Fetch scanner.json ---
async function getScannerData() {
  const url = "https://dashproduction.x10.mx/masterfile/scanner/machining/barcode/scanner.json";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    console.log(`Fetched ${data.length} items from scanner.json`);
    return data;
  } catch (err) {
    console.error("Failed to fetch scanner.json:", err);
    return [];
  }
}

// --- Filter today's entries robustly ---
function filterToday(data) {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const todayStr = today.toDateString();

  const todayData = data.filter(d => {
    if (!d.date) return false;
    let parsedDate;
    try {
      // Handle both YYYY-MM-DD and MM/DD/YYYY formats
      const cleanDate = d.date.replace(/\\/g, "");
      parsedDate = new Date(cleanDate);
      parsedDate = new Date(parsedDate.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    } catch {
      console.warn("Invalid date format, skipping:", d.date);
      return false;
    }
    return parsedDate.toDateString() === todayStr;
  });

  console.log(`Found ${todayData.length} items for today (${todayStr})`);
  if (todayData.length > 0) {
    console.log("Today's items:", todayData.map(i => `${i.date} | ${i.item} | ${i.client}`));
  }

  return todayData;
}

// --- PDF + Email ---
async function generateAndSendDailyReport() {
  try {
    const data = await getScannerData();
    const todayData = filterToday(data);

    if (!todayData.length) {
      console.log("No data for today. Email will not be sent.");
      return;
    }

    // Generate PDF
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text(
      `Daily Barcode Report - ${new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}`,
      105,
      10,
      { align: "center" }
    );

    doc.autoTable({
      head: [["Date", "Item", "Client", "Department", "Quantity", "Barcode"]],
      body: todayData.map(d => [d.date, d.item, d.client, d.department, d.qty, d.barcode]),
      startY: 20,
      styles: { fontSize: 9 },
    });

    const pdfBytes = doc.output("arraybuffer");

    // Check Gmail credentials
    const { GMAIL_USER, GMAIL_PASS } = process.env;
    if (!GMAIL_USER || !GMAIL_PASS) {
      throw new Error("Missing Gmail credentials in environment variables.");
    }

    // Create transporter with debug
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      logger: true, // logs SMTP activity
      debug: true,
    });

    const mailOptions = {
      from: GMAIL_USER,
      to: "judedabon123@gmail.com",
      subject: `Daily Barcode Report - ${new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}`,
      text: `Attached is the daily barcode report with ${todayData.length} scanned items.`,
      attachments: [{ filename: "daily-report.pdf", content: Buffer.from(pdfBytes) }],
    };

    // Send email with callback to log success or error
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Email failed:", err);
      } else {
        console.log("Email sent successfully!");
        console.log("SMTP info:", info);
      }
    });

  } catch (err) {
    console.error("Error generating or sending report:", err);
  }
}

// Run
generateAndSendDailyReport();
