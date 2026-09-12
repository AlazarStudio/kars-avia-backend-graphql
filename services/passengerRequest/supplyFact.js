// Факт поставки воды/питания ФАП — одна поставка на услугу заявки (владелец:
// «одна поставка на рейс»). Скаляры живут на композите PassengerWaterFoodService
// рядом с планом. Пока suppliedAt пуст, поставки как факта нет: сумма для АК
// не хранится и считается из quantity × unitPrice + deliveryCost.

import { GraphQLError } from "graphql"
import {
  toMoney,
  toWholeCountOrNull,
  toTrimmedOrNull
} from "./coerce.js"

const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key)

// Дата поставки — момент факта; мусор отбиваем ошибкой, а не молча превращаем в
// null: иначе диспетчер сохранил бы «пусто» и решил, что дата записалась.
// Тип проверяем отдельно от разбора, как assertMoment (envelope.js): new Date(true)
// молча даёт эпоху, и «поставка 01.01.1970» выглядела бы записанной датой.
// Будущего здесь НЕ запрещаем: форма подставляет плановое время поставки.
const toDateOrThrow = (value) => {
  if (value == null || value === "") return null
  const supported =
    value instanceof Date || typeof value === "string" || typeof value === "number"
  const date = supported ? new Date(value) : new Date(NaN)
  if (Number.isNaN(date.getTime())) {
    throw new GraphQLError("Некорректная дата поставки", {
      extensions: { code: "BAD_USER_INPUT" }
    })
  }
  return date
}

// Собирает из патча ТОЛЬКО реально переданные ключи факта поставки.
// «Ключа нет» — не трогаем; «ключ есть, значение null» — сбрасываем.
export const collectSupplyPatch = (patch = {}) => {
  const applied = {}
  if (has(patch, "supplier")) applied.supplier = toTrimmedOrNull(patch.supplier)
  if (has(patch, "suppliedAt")) applied.suppliedAt = toDateOrThrow(patch.suppliedAt)
  if (has(patch, "quantity")) applied.quantity = toWholeCountOrNull(patch.quantity)
  if (has(patch, "unitPrice")) applied.unitPrice = toMoney(patch.unitPrice)
  if (has(patch, "deliveryCost")) applied.deliveryCost = toMoney(patch.deliveryCost)
  if (has(patch, "supplierCost")) applied.supplierCost = toMoney(patch.supplierCost)
  return applied
}
