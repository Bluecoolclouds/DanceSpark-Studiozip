import { useEffect } from 'react';
import { useGetCatalogueTemplate, useListCatalogueInfinite, type ListCatalogueParams } from '@workspace/api-client-react';
import { fromCatalogue, mergeCataloguePages } from '@/lib/catalogue';
import { rememberTemplates, getTemplate } from '@/constants/templates';

export function useCatalogue(params: Omit<ListCatalogueParams, 'cursor'> = {}) {
  const query = useListCatalogueInfinite(params, {
    query: {
      initialPageParam: undefined,
      getNextPageParam: page => page.hasNextPage ? page.nextCursor ?? undefined : undefined,
      staleTime: 30_000,
      refetchOnMount: 'always',
      refetchInterval: 60_000,
    },
  });
  const items = mergeCataloguePages(query.data?.pages ?? []);
  useEffect(() => { rememberTemplates(items); }, [query.data]);
  return { ...query, items, total: query.data?.pages[0]?.total ?? 0 };
}

export function useCatalogueTemplate(id?: string) {
  const query = useGetCatalogueTemplate(id ?? '', { query: { enabled: !!id, staleTime: 30_000, retry: false } });
  const template = query.data ? fromCatalogue(query.data) : undefined;
  useEffect(() => { if (template) rememberTemplates([template]); }, [query.data]);
  return { ...query, template, legacy: getTemplate(id) };
}
