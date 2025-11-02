export async function resolve(specifier, context, defaultResolve) {
  const result = await defaultResolve(specifier, context, defaultResolve);
  if (specifier.includes('vitest')) {
    console.error(
      '[trace-vitest-loader] resolving',
      specifier,
      'from',
      context.parentURL || '<unknown>',
    );
  }
  return result;
}

export async function load(url, context, defaultLoad) {
  if (url.includes('vitest')) {
    console.error(
      '[trace-vitest-loader] loading',
      url,
      'requested by',
      context.parentURL || '<unknown>',
    );
  }
  return defaultLoad(url, context, defaultLoad);
}
