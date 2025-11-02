import Module from 'node:module';

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (typeof request === 'string' && request.includes('@vitest/expect')) {
    const parentFile = parent && parent.filename ? parent.filename : '<unknown>';
    console.error('[trace-vitest] loading', request, 'from', parentFile);
  }
  return originalLoad.apply(this, arguments);
};
