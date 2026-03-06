import { v4 as uuidv4 } from "uuid"

export const ensurePassengerServiceHotelItemId = (hotel) => ({
  ...hotel,
  itemId: hotel?.itemId || uuidv4()
})
