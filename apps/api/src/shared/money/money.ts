import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

export const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(2);

export const sumMoney = (values: Money[]) => values.reduce((total, value) => total.plus(value), money(0));
