if (process.env.NODE_ENV !== 'test') {
  throw new Error('The benchmark Arcjet mock requires test mode.');
}

const protector = {
  withRule: () => protector,
  protect: async () => ({ conclusion: 'ALLOW', isDenied: () => false }),
};
export default protector;
