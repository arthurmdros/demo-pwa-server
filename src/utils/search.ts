import { Request } from "express";

export function buildFilters(req: Request, allowedFields: string[] = []) {
  const whereClauses: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    const value = req.query[field];
    if (value) {
      whereClauses.push(`${field} LIKE ?`);
      params.push(`%${value}%`);
    }
  }

  const whereSQL = whereClauses.length
    ? "WHERE " + whereClauses.join(" AND ")
    : "";
  return { whereSQL, params };
}

export function buildSorting(
  req: Request,
  allowedSortFields: string[] = [],
  defaultSortField = "id"
) {
  let sortField = defaultSortField;
  let sortOrder = "ASC";

  if (req.query.sort && allowedSortFields.includes(req.query.sort as string)) {
    sortField = req.query.sort as string;
  }

  if (req.query.order && req.query.order.toString().toUpperCase() === "DESC") {
    sortOrder = "DESC";
  }

  const orderSQL = sortField ? `ORDER BY ${sortField} ${sortOrder}` : "";
  return { orderSQL, sortField, sortOrder };
}
