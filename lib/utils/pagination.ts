export const DEFAULT_PAGE_SIZE = 50;

export type PaginationInput = {
  page?: string | string[] | undefined;
  pageSize?: string | string[] | undefined;
};

export type PaginationState = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

function pickString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parsePagination(
  params: PaginationInput,
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): PaginationState {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? 200;

  const rawPage = Number(pickString(params.page));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const rawSize = Number(pickString(params.pageSize));
  const pageSize = Number.isFinite(rawSize) && rawSize > 0
    ? Math.min(Math.floor(rawSize), maxPageSize)
    : defaultPageSize;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type PageLinkBuilder = (nextPage: number) => string;

export function buildPageHref(
  basePath: string,
  baseParams: URLSearchParams,
  nextPage: number,
  pageSize?: number,
  defaultPageSize: number = DEFAULT_PAGE_SIZE,
): string {
  const params = new URLSearchParams(baseParams);
  params.delete("page");
  params.delete("pageSize");
  if (nextPage > 1) params.set("page", String(nextPage));
  if (pageSize && pageSize !== defaultPageSize) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
