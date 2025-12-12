import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load .env only when NOT in GitHub Actions
if (process.env.GITHUB_ACTIONS !== "true") {
  dotenv.config();
}

// --- TEST MODE ---
// When true, only sends to your email.
const TEST_MODE = true;
const TEST_EMAIL = "judedabon123@gmail.com";

// --- Fetch scanner.json ---
async function getScannerData() {
  const url = "https://dashproduction.x10.mx/masterfile/scanner/machining/barcode/scanner.json";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    console.log(`[INFO] Fetched ${data.length} items from scanner.json`);
    return data;
  } catch (err) {
    console.error("[ERROR] Failed to fetch scanner.json:", err);
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
      const cleanDate = d.date.replace(/\\/g, "").trim();

      // Handle YYYY-MM-DD or MM/DD/YYYY
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        const [year, month, day] = cleanDate.split("-").map(Number);
        parsedDate = new Date(year, month - 1, day);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDate)) {
        const [month, day, year] = cleanDate.split("/").map(Number);
        parsedDate = new Date(year, month - 1, day);
      } else {
        console.warn("[WARN] Unknown date format, skipping:", d.date);
        return false;
      }

      parsedDate = new Date(parsedDate.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    } catch {
      console.warn("[WARN] Invalid date format, skipping:", d.date);
      return false;
    }

    return parsedDate.toDateString() === todayStr;
  });

  console.log(`[INFO] Found ${todayData.length} items for today (${todayStr})`);
  if (todayData.length > 0) {
    console.log("[INFO] Today's items:", todayData.map(i => `${i.date} | ${i.item} | ${i.client}`));
  }

  return todayData;
}

// --- PDF + Email ---
async function generateAndSendDailyReport() {
  try {
    console.log("[INFO] Starting daily report generation...");

    const data = await getScannerData();
    const todayData = filterToday(data);

    if (!todayData.length) {
      console.log("[INFO] No data for today. Email will not be sent.");
      return;
    }

    console.log("[INFO] Generating PDF...");
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
    console.log("[INFO] PDF generated successfully.");

    const { GMAIL_USER, GMAIL_PASS } = process.env;
    if (!GMAIL_USER || !GMAIL_PASS) {
      throw new Error("Missing Gmail credentials in environment variables.");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      logger: true,
      debug: true,
    });

    await transporter.verify();
    console.log("[INFO] Transporter verified successfully.");

    const mailOptions = {
      from: GMAIL_USER,
      to: TEST_MODE ? TEST_EMAIL : GMAIL_USER, // only send to you in test mode
      subject: `Daily Barcode Report - ${new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}`,
      text: `Attached is the daily barcode report with ${todayData.length} scanned items.`,
      attachments: [{ filename: "daily-report.pdf", content: Buffer.from(pdfBytes) }],
    };

    console.log("[INFO] Sending email...");
    const info = await transporter.sendMail(mailOptions);
    console.log("[SUCCESS] Email sent successfully!");
    console.log("[INFO] SMTP response:", info.response);

  } catch (err) {
    console.error("[ERROR] Error generating or sending report:", err);
    if (err.response) console.error("[SMTP RESPONSE]", err.response);
  }
}

// Run
generateAndSendDailyReport();
