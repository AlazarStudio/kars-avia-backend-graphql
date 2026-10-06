// Проверки входа пользователя CRM вынесены из signInUser, чтобы второй вход
// (transferSignIn) применял те же правила, а не свою урезанную копию (ПДН-Е-09).

import test from "node:test"
import assert from "node:assert/strict"
import speakeasy from "@levminer/speakeasy"
import {
  assertUser2FA,
  assertUserMaySignIn
} from "../../services/auth/signInUser.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"

releasePubsubAfterTests()

test("assertUserMaySignIn: неактивная учётка — отказ", () => {
  assert.throws(
    () => assertUserMaySignIn({ active: false, emailVerified: true }),
    /User is not active/
  )
})

test("assertUserMaySignIn: неподтверждённая почта — отказ", () => {
  assert.throws(
    () => assertUserMaySignIn({ active: true, emailVerified: false }),
    /Подтвердите email перед входом/
  )
})

test("assertUserMaySignIn: активная и подтверждённая — без ошибки", () => {
  assert.doesNotThrow(() =>
    assertUserMaySignIn({ active: true, emailVerified: true })
  )
})

test("assertUser2FA: 2FA выключена — код не нужен", () => {
  assert.doesNotThrow(() => assertUser2FA({ is2FAEnabled: false }, undefined))
})

test("assertUser2FA: 2FA включена, кода нет или он неверный — отказ", () => {
  const secret = speakeasy.generateSecret().base32
  const user = { is2FAEnabled: true, twoFAMethod: "TOTP", twoFASecret: secret }
  assert.throws(() => assertUser2FA(user, undefined), /Invalid 2FA token/)
  assert.throws(() => assertUser2FA(user, ""), /Invalid 2FA token/)
  assert.throws(() => assertUser2FA(user, "abc"), /Invalid 2FA token/)
})

test("assertUser2FA: верный TOTP — без ошибки", () => {
  const secret = speakeasy.generateSecret().base32
  const user = { is2FAEnabled: true, twoFAMethod: "TOTP", twoFASecret: secret }
  const token = speakeasy.totp({ secret, encoding: "base32" })
  assert.doesNotThrow(() => assertUser2FA(user, token))
})

test("assertUser2FA: 2FA включена без известного метода — отказ", () => {
  const user = { is2FAEnabled: true, twoFAMethod: null, twoFASecret: "X" }
  assert.throws(() => assertUser2FA(user, "123456"), /Invalid 2FA token/)
})
