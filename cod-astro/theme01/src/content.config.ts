// Products and categories are fetched at SSR request time in each page
// via fetchProductsRaw() / fetchCategoriesRaw() from @/core/api/client.
// Build-time content loaders can't know which channel is being rendered.
export const collections = {};
