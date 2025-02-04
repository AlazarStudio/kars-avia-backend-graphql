import ExcelJS from "exceljs";
import pdfMake from "pdfmake/build/pdfmake.js";
import * as pdfFonts from "pdfmake/build/vfs_fonts.js";
import fs from "fs";

// Настройка шрифтов для pdfMake
pdfMake.vfs = pdfFonts.default?.pdfMake?.vfs || pdfFonts.pdfMake?.vfs;

// Функция для форматирования числа в рубли
const formatCurrency = (value) => {
  if (!value || isNaN(value)) return "0 ₽";
  return `${Number(value).toLocaleString("ru-RU")} ₽`;
};

export const generateExcelAvia = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Отчет по авиакомпаниям");

  sheet.columns = [
    { header: "п/п", key: "index", width: 5 },
    { header: "ФИО", key: "personName", width: 20 },
    { header: "Дата/время заезда", key: "arrival", width: 20 },
    { header: "Дата/время выезда", key: "departure", width: 20 },
    { header: "кол-во суток", key: "totalDays", width: 10 },
    { header: "Категория номера", key: "category", width: 15 },
    { header: "Тип комнаты", key: "roomType", width: 10 },
    { header: "Питание", key: "meals", width: 15 },
    { header: "Стоимость питания", key: "totalMealCost", width: 15 },
    { header: "Стоимость проживания", key: "totalLivingCost", width: 15 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 15 }
  ];

  reportData.forEach((row, index) => {
    sheet.addRow({
      index: index + 1,
      personName: row.personName,
      arrival: row.arrival || "Не указано",
      departure: row.departure || "Не указано",
      totalDays: row.totalDays,
      category: "Одноместный", // Дефолтное значение
      roomType: "Номер",
      meals: `${row.breakfastCount}-${row.lunchCount}-${row.dinnerCount}`,
      totalMealCost: formatCurrency(row.totalMealCost),
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalDebt: formatCurrency(row.totalDebt)
    });
  });

  // Итоговая строка
  sheet.addRow({});
  sheet.addRow({
    personName: "ИТОГО",
    totalMealCost: formatCurrency(reportData.reduce((sum, row) => sum + row.totalMealCost, 0)),
    totalLivingCost: formatCurrency(reportData.reduce((sum, row) => sum + row.totalLivingCost, 0)),
    totalDebt: formatCurrency(reportData.reduce((sum, row) => sum + row.totalDebt, 0))
  });

  await workbook.xlsx.writeFile(filePath);
};

export const generateExcelHotel = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Развёрнутый отчёт");

  sheet.columns = [
    { header: "Дата", key: "date", width: 15 },
    { header: "Комната", key: "roomName", width: 20 },
    { header: "Категория", key: "category", width: 15 },
    { header: "Занятость", key: "isOccupied", width: 15 },
    { header: "Количество дней", key: "totalDays", width: 15 },
    { header: "Завтраков", key: "breakfastCount", width: 12 },
    { header: "Обедов", key: "lunchCount", width: 12 },
    { header: "Ужинов", key: "dinnerCount", width: 12 },
    { header: "Стоимость питания", key: "totalMealCost", width: 18 },
    { header: "Цена за день", key: "dailyPrice", width: 15 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 18 }
  ];

  reportData.forEach((row) => {
    sheet.addRow({
      date: row.date || "Не указано",
      roomName: row.roomName || "Не указано",
      category: row.category || "Не указано",
      isOccupied: row.isOccupied === "Занято" ? "Занято" : "Свободно",
      totalDays: row.totalDays || 0,
      breakfastCount: row.breakfastCount || 0,
      lunchCount: row.lunchCount || 0,
      dinnerCount: row.dinnerCount || 0,
      totalMealCost: formatCurrency(row.totalMealCost || 0),
      dailyPrice: formatCurrency(row.dailyPrice || 0),
      totalDebt: formatCurrency(row.totalDebt || 0)
    });
  });

  // Итоговая строка
  sheet.addRow({});
  sheet.addRow({
    date: "ИТОГО",
    totalDays: reportData.reduce((sum, row) => sum + row.totalDays, 0),
    breakfastCount: reportData.reduce((sum, row) => sum + row.breakfastCount, 0),
    lunchCount: reportData.reduce((sum, row) => sum + row.lunchCount, 0),
    dinnerCount: reportData.reduce((sum, row) => sum + row.dinnerCount, 0),
    totalMealCost: formatCurrency(reportData.reduce((sum, row) => sum + row.totalMealCost, 0)),
    totalDebt: formatCurrency(reportData.reduce((sum, row) => sum + row.totalDebt, 0))
  });

  await workbook.xlsx.writeFile(filePath);
};
