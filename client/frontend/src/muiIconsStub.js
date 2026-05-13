export default new Proxy({}, { get: () => () => null });
