import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";

const generatePDF = (reportData, title) => {
  const doc = new jsPDF();
  doc.text(title, 10, 10);
  reportData.forEach((data, index) => {
    doc.text(`${index + 1}. ${data.name} - ${data.totalCost}`, 10, 20 + index * 10);
  });
  doc.save(`${title}.pdf`);
};

const generateExcel = (reportData, title) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);
  sheet.columns = [
    { header: "Name", key: "name" },
    { header: "Total Cost", key: "totalCost" },
  ];
  sheet.addRows(reportData);
  workbook.xlsx.writeFile(`${title}.xlsx`);
};

export { generatePDF, generateExcel };
