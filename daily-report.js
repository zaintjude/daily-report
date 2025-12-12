import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load .env locally
if (process.env.GITHUB_ACTIONS !== "true") {
  dotenv.config();
}

async function getScannerData() {
  const url = "https://dashproduction.x10.mx/masterfile/scanner/machining/barcode/scanner.json";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    console.log(`Fetched ${data.length} items`);
    return data;
  } catch (err) {
    console.error("Failed to fetch scanner.json:", err);
    return [];
  }
}

function filterToday(data) {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const todayStr = today.toDateString();

  const todayData = data.filter(d => {
    if (!d.date) return false;
    let parsedDate;
    try {
      const cleanDate = d.date.replace(/\\/g, "");
      parsedDate = new Date(cleanDate);
      parsedDate = new Date(parsedDate.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    } catch {
      return false;
    }
    return parsedDate.toDateString() === todayStr;
  });

  console.log(`Found ${todayData.length} items for today`);
  return todayData;
}

async function generateAndSendDailyReport() {
  try {
    const data = await getScannerData();
    const todayData = filterToday(data);

    if (!todayData.length) {
      console.log("No data for today. Email will not be sent.");
      return;
    }

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

    const { GMAIL_USER, GMAIL_PASS } = process.env;
    if (!GMAIL_USER || !GMAIL_PASS) throw new Error("Missing Gmail credentials");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      logger: true,
      debug: true,
    });

    // Use async/await instead of callback
    const info = await transporter.sendMail({
      from: GMAIL_USER,
      to: "judedabon123@gmail.com",
      subject: `Daily Barcode Report - ${new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}`,
      text: `Attached is the daily barcode report with ${todayData.length} items.`,
      attachments: [{ filename: "daily-report.pdf", content: Buffer.from(pdfBytes) }],
    });

    console.log("Email sent successfully!");
    console.log("SMTP info:", info);

  } catch (err) {
    console.error("Error generating/sending report:", err);
  }
}

generateAndSendDailyReport();
