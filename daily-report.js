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
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch scanner.json:", err);
    return [];
  }
}

// --- Filter only today's entries ---
function filterToday(data) {
  const today = new Date();
  const todayStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  return data.filter(d => d.date.replace(/\\/g, "") === todayStr);
}

// --- PDF + Email ---
async function generateAndSendDailyReport() {
  try {
    const data = await getScannerData();
    const todayData = filterToday(data);

    if (!todayData.length) {
      console.log("No data for today.");
      return;
    }

    // PDF
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Daily Barcode Report - ${new Date().toLocaleDateString()}`, 105, 10, { align: "center" });

    doc.autoTable({
      head: [["Date", "Item", "Client", "Department", "Quantity"]],
      body: todayData.map(d => [d.date, d.item, d.client, d.department, d.qty]),
      startY: 20,
      styles: { fontSize: 9 },
    });

    const pdfBytes = doc.output("arraybuffer");

    // Check env vars
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
      throw new Error("Missing Gmail credentials.");
    }

    // Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: "judedabon123@gmail.com, primeconceptanddesign@gmail.com",
      subject: `Daily Barcode Report - ${new Date().toLocaleDateString()}`,
      text: `Attached is the daily barcode report.`,
      attachments: [{ filename: "daily-report.pdf", content: Buffer.from(pdfBytes) }],
    });

    console.log("Daily report email sent successfully!");
  } catch (err) {
    console.error("Error generating/sending report:", err);
  }
}

// Run
generateAndSendDailyReport();
