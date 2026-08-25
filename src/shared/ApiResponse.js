/**
 * Every successful response shares one envelope so the frontend never has to
 * guess at the shape:
 *   { success: true, data: <payload>, meta?: <pagination/etc> }
 */
export function ok(res, data, meta, statusCode = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function created(res, data) {
  return ok(res, data, undefined, 201);
}

export function noContent(res) {
  return res.status(204).send();
}

/** Pagination metadata block shared by every list endpoint. */
export function paginationMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
