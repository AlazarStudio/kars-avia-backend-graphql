import { prisma } from "../../prisma.js"

export async function organizationContractData(
  organizationContractId,
  organizationId
) {
  if (organizationContractId === undefined) return {}
  if (!organizationContractId) return { organizationContractId: null }

  const contract = await prisma.organizationContract.findUnique({
    where: { id: organizationContractId },
    select: { id: true, organizationId: true }
  })
  if (!contract) throw new Error("Договор организации не найден")
  if (
    organizationId &&
    contract.organizationId &&
    String(contract.organizationId) !== String(organizationId)
  ) {
    throw new Error("Договор принадлежит другому поставщику")
  }
  return { organizationContractId: contract.id }
}
