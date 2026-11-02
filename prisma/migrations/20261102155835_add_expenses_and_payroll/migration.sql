-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('PETTY_CASH', 'ADMIN', 'PAYROLL');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "PayslipLineKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pettyCash" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "source" "ExpenseSource" NOT NULL DEFAULT 'ADMIN',
    "createdById" TEXT,
    "payslipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherPay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlySalary" DOUBLE PRECISION NOT NULL,
    "designation" TEXT,
    "pan" TEXT,
    "bankAccount" TEXT,
    "joinedOn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "monthlySalary" DOUBLE PRECISION NOT NULL,
    "netPay" DOUBLE PRECISION NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "paidOn" TIMESTAMP(3),
    "note" TEXT,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalisedAt" TIMESTAMP(3),

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipLine" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "kind" "PayslipLineKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_payslipId_key" ON "Expense"("payslipId");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPay_userId_key" ON "TeacherPay"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_teacherId_year_month_key" ON "Payslip"("teacherId", "year", "month");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPay" ADD CONSTRAINT "TeacherPay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starting expense headings. pettyCash = front desk may use it; the rest are the
-- admin's. "Salaries" is also what finalising a payslip files its expense under.
INSERT INTO "ExpenseCategory" ("id", "name", "pettyCash", "sortOrder") VALUES
  (gen_random_uuid()::text, 'Rent', false, 10),
  (gen_random_uuid()::text, 'Salaries', false, 20),
  (gen_random_uuid()::text, 'Maintenance & repairs', false, 30),
  (gen_random_uuid()::text, 'Electricity', false, 40),
  (gen_random_uuid()::text, 'Water', false, 50),
  (gen_random_uuid()::text, 'Internet & phone', false, 60),
  (gen_random_uuid()::text, 'Marketing & advertising', false, 70),
  (gen_random_uuid()::text, 'Instruments & equipment', false, 80),
  (gen_random_uuid()::text, 'Software & subscriptions', false, 90),
  (gen_random_uuid()::text, 'Taxes & statutory dues', false, 100),
  (gen_random_uuid()::text, 'Professional fees', false, 110),
  (gen_random_uuid()::text, 'Refreshments & pantry', true, 200),
  (gen_random_uuid()::text, 'Stationery & printing', true, 210),
  (gen_random_uuid()::text, 'Travel & conveyance', true, 220),
  (gen_random_uuid()::text, 'Cleaning & housekeeping', true, 230),
  (gen_random_uuid()::text, 'Courier & postage', true, 240),
  (gen_random_uuid()::text, 'Small repairs', true, 250),
  (gen_random_uuid()::text, 'Miscellaneous', true, 260);
