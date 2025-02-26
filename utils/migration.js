// migration.js
import { PrismaClient as OldPrismaClient } from "./oldPrismaClient.js" // Клиент для старой базы (бэкап)
import { PrismaClient as NewPrismaClient } from "./prisma.js" // Клиент для новой базы

const oldPrisma = new OldPrismaClient()
const newPrisma = new NewPrismaClient()

// Пример миграции для модели Airline
async function migrateAirlines() {
  // Читаем все записи из старой базы
  const oldAirlines = await oldPrisma.airline.findMany()

  console.log(`Найдено ${oldAirlines.length} авиакомпаний для миграции.`)

  for (const oldAirline of oldAirlines) {
    // Если раньше информация о контактах и реквизитах была хранится отдельными полями,
    // а теперь она объединена в составной тип Information, то собираем новый объект:
    const information = {
      country: oldAirline.country, // например, "Россия"
      city: oldAirline.city,
      address: oldAirline.address,
      index: oldAirline.index,
      email: oldAirline.email,
      number: oldAirline.number,
      inn: oldAirline.inn,
      ogrn: oldAirline.ogrn,
      rs: oldAirline.rs,
      bank: oldAirline.bank,
      bik: oldAirline.bik,
      link: oldAirline.link,
      description: oldAirline.description
    }

    // Если ранее цены хранились в отдельных полях, а теперь в объекте Price,
    // составляем объект цен:
    const prices = {
      priceOneCategory: oldAirline.priceOneCategory,
      priceTwoCategory: oldAirline.priceTwoCategory,
      priceThreeCategory: oldAirline.priceThreeCategory,
      priceFourCategory: oldAirline.priceFourCategory,
      priceFiveCategory: oldAirline.priceFiveCategory,
      priceSixCategory: oldAirline.priceSixCategory,
      priceSevenCategory: oldAirline.priceSevenCategory,
      priceEightCategory: oldAirline.priceEightCategory,
      priceNineCategory: oldAirline.priceNineCategory,
      priceTenCategory: oldAirline.priceTenCategory
    }

    // Если поле питания (MealPrice) осталось без изменений, можно просто его передать.
    // Если требуются изменения, выполните преобразование.
    const mealPrice = oldAirline.MealPrice

    // Собираем объект для создания новой записи.
    const newAirlineData = {
      name: oldAirline.name,
      images: oldAirline.images, // Если формат массива строк совпадает
      information, // Новое составное поле
      mealPrice, // Поле питания (если не изменилось)
      prices // Новое составное поле для цен
      // Если есть другие поля – добавьте их здесь.
    }

    // Чтобы не мигрировать дубликаты (например, по email или login), можно проверить наличие:
    const exists = await newPrisma.airline.findUnique({
      where: { email: oldAirline.email }
    })

    if (!exists) {
      const createdAirline = await newPrisma.airline.create({
        data: newAirlineData
      })
      console.log(`Migrated airline: ${createdAirline.name}`)
    } else {
      console.log(`Airline ${oldAirline.name} уже существует, пропускаем.`)
    }
  }
}

// Аналогичные функции можно написать для других моделей:
// async function migrateHotels() { ... }
// async function migrateRequests() { ... }
// async function migrateReserves() { ... }
// async function migrateUsers() { ... }

async function migrateAll() {
  try {
    console.log("Начало миграции...")
    await migrateAirlines()
    // await migrateHotels();
    // await migrateRequests();
    // await migrateReserves();
    // await migrateUsers();
    console.log("Миграция успешно завершена.")
  } catch (error) {
    console.error("Ошибка миграции:", error)
  } finally {
    await oldPrisma.$disconnect()
    await newPrisma.$disconnect()
  }
}

migrateAll()
