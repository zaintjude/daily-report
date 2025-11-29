import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import "jspdf-autotable"; // plugin for tables
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env

// --- Fetch scanner.json from your hosting ---
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

// --- Filter only today's data ---
function filterToday(data) {
  const today = new Date();
  const todayStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`; // MM/DD/YYYY
  return data.filter(d => {
    // Remove any escaped slashes in dates
    const cleanedDate = d.date.replace(/\\/g, "");
    return cleanedDate === todayStr;
  });
}

// --- Generate PDF & send email ---
async function generateAndSendDailyReport() {
  try {
    const data = await getScannerData();
    const todayData = filterToday(data);

    if (!todayData.length) {
      console.log("No data for today.");
      return;
    }

    // --- Create PDF ---
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Daily Barcode Report - ${new Date().toLocaleDateString()}`, 105, 10, { align: "center" });

    const tableData = todayData.map(d => [d.date, d.item, d.client, d.department, d.qty]);
    doc.autoTable({
      head: [["Date", "Item", "Client", "Department", "Quantity"]],
      body: tableData,
      startY: 20,
      styles: { fontSize: 9 },
    });

    const pdfBytes = doc.output("arraybuffer");

    // --- Check environment variables ---
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
      throw new Error("Missing Gmail credentials. Set GMAIL_USER and GMAIL_PASS in your .env file.");
    }

    // --- Email setup ---
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS, // App password
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: "judedabon123@gmail.com",
      subject: `Daily Barcode Report - ${new Date().toLocaleDateString()}`,
      text: `Attached is the daily barcode report for ${new Date().toLocaleDateString()}.`,
      attachments: [{ filename: "daily-report.pdf", content: Buffer.from(pdfBytes) }],
    };

    await transporter.sendMail(mailOptions);
    console.log("Daily report email sent successfully!");
  } catch (err) {
    console.error("Error generating/sending daily report:", err);
  }
}

// Run immediately
generateAndSendDailyReport();
