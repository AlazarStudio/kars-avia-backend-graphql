import pdfMake from "pdfmake";
import ExcelJS from "exceljs";

const generatePDF = (reportData, title = "Отчёт") => {
  const docDefinition = {
    content: [
      { text: title, style: "header", alignment: "center", margin: [0, 0, 0, 20] },
      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "*", "*", "*", "*"],
          body: [
            // Заголовки таблицы
            ["Авиакомпания", "Имя", "Проживание", "Питание", "Долг", "Итог"],
            // Данные отчета
            ...reportData.map((row) => [
              row.airlineName || "Не указано",
              row.personName || "Не указано",
              row.totalLivingCost || 0,
              row.totalMealCost || 0,
              row.totalDebt || 0,
              row.totalLivingCost + row.totalMealCost || 0
            ])
          ]
        },
        layout: "lightHorizontalLines" // Визуальное оформление таблицы
      }
    ],
    styles: {
      header: {
        fontSize: 18,
        bold: true
      },
      tableHeader: {
        bold: true,
        fontSize: 12,
        color: "black"
      }
    }
  };

  pdfMake.createPdf(docDefinition).download(`${title}.pdf`);
};

const generateExcel = async (reportData, title = "Отчёт") => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);

  // Заголовки таблицы
  sheet.columns = [
    { header: "Авиакомпания", key: "airlineName", width: 20 },
    { header: "Имя", key: "personName", width: 20 },
    { header: "Проживание", key: "totalLivingCost", width: 15 },
    { header: "Питание", key: "totalMealCost", width: 15 },
    { header: "Долг", key: "totalDebt", width: 15 },
    { header: "Итог", key: "totalCost", width: 15 }
  ];

  // Добавляем строки с данными
  reportData.forEach((row) => {
    sheet.addRow({
      airlineName: row.airlineName || "Не указано",
      personName: row.personName || "Не указано",
      totalLivingCost: row.totalLivingCost || 0,
      totalMealCost: row.totalMealCost || 0,
      totalDebt: row.totalDebt || 0,
      totalCost: (row.totalLivingCost || 0) + (row.totalMealCost || 0)
    });
  });

  // Сохраняем файл
  await workbook.xlsx.writeFile(`${title}.xlsx`);
};

export { generatePDF, generateExcel };