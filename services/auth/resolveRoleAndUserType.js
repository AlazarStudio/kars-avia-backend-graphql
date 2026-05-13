export const USER_TYPE = {
  DEFAULT: "DEFAULT",
  REPRESENTATIVE: "REPRESENTATIVE"
}

export const ROLE = {
  REPRESENTATIVE: "REPRESENTATIVE"
}

export function resolveRoleAndUserType({ role, userType, fallbackRole = "USER" }) {
  const finalRole = role || fallbackRole
  let finalUserType = userType || USER_TYPE.DEFAULT

  if (finalRole === ROLE.REPRESENTATIVE) {
    finalUserType = USER_TYPE.REPRESENTATIVE
  } else if (finalUserType === USER_TYPE.REPRESENTATIVE) {
    finalUserType = USER_TYPE.DEFAULT
  }

  return { finalRole, finalUserType }
}
