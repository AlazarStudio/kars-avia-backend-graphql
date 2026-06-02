export const buildAirlineWhere = (filter) => {
  if (!filter?.search?.trim()) return {}
  const s = filter.search.trim()
  return {
    AND: [
      {
        OR: [
          { name: { contains: s, mode: "insensitive" } },
          { nameFull: { contains: s, mode: "insensitive" } }
        ]
      }
    ]
  }
}
