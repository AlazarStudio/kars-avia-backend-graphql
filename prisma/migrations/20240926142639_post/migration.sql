-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'DISPATCHERADMIN', 'HOTELADMIN', 'AIRLINEADMIN', 'DISPATCHERMODERATOR', 'HOTELMODERATOR', 'AIRLINEMODERATOR', 'DISPATCHERUSER', 'HOTELUSER', 'AIRLINEUSER', 'USER');

-- CreateEnum
CREATE TYPE "TwoFAMethod" AS ENUM ('HOTP', 'TOTP');

-- CreateTable
CREATE TABLE "User" (
    "_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "number" TEXT,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "hotelId" TEXT,
    "airlineId" TEXT,
    "images" TEXT[],
    "airlineDepartmentId" TEXT,
    "dispatcher" BOOLEAN DEFAULT false,
    "is2FAEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFASecret" TEXT,
    "twoFAMethod" "TwoFAMethod",

    CONSTRAINT "User_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "index" TEXT,
    "quote" TEXT,
    "email" TEXT,
    "number" TEXT,
    "inn" TEXT,
    "ogrn" TEXT,
    "rs" TEXT,
    "bank" TEXT,
    "bik" TEXT,
    "images" TEXT[],

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Category" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "tariffId" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Price" (
    "_id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "amountair" DOUBLE PRECISION,
    "tariffId" TEXT,
    "categoryId" TEXT,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Room" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "tariffId" TEXT,
    "places" DOUBLE PRECISION,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Airline" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "images" TEXT[],
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "index" TEXT,
    "quote" TEXT,
    "email" TEXT,
    "number" TEXT,
    "inn" TEXT,
    "ogrn" TEXT,
    "rs" TEXT,
    "bank" TEXT,
    "bik" TEXT,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "AirlineDepartment" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "airlineId" TEXT NOT NULL,

    CONSTRAINT "AirlineDepartment_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "AirlinePersonal" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "position" TEXT,
    "gender" TEXT,
    "airlineId" TEXT,
    "departmentId" TEXT,

    CONSTRAINT "AirlinePersonal_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Airport" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,

    CONSTRAINT "Airport_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Request" (
    "_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "gender" TEXT,
    "phoneNumber" TEXT,
    "airportId" TEXT NOT NULL,
    "roomCategory" TEXT NOT NULL,
    "roomNumber" TEXT,
    "airlineId" TEXT NOT NULL,
    "hotelId" TEXT,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',

    CONSTRAINT "Request_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Arrival" (
    "requestId" TEXT NOT NULL,
    "flight" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Departure" (
    "requestId" TEXT NOT NULL,
    "flight" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "requestId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL,
    "breakfast" BOOLEAN,
    "lunch" BOOLEAN,
    "dinner" BOOLEAN
);

-- CreateTable
CREATE TABLE "Message" (
    "_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "chatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "_id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Log" (
    "_id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Arrival_requestId_key" ON "Arrival"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Departure_requestId_key" ON "Departure"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_requestId_key" ON "MealPlan"("requestId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_airlineDepartmentId_fkey" FOREIGN KEY ("airlineDepartmentId") REFERENCES "AirlineDepartment"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirlineDepartment" ADD CONSTRAINT "AirlineDepartment_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirlinePersonal" ADD CONSTRAINT "AirlinePersonal_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirlinePersonal" ADD CONSTRAINT "AirlinePersonal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "AirlineDepartment"("_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "Airport"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arrival" ADD CONSTRAINT "Arrival_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Departure" ADD CONSTRAINT "Departure_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("_id") ON DELETE SET NULL ON UPDATE CASCADE;
