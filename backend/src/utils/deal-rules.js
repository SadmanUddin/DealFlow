const transitions = {
  proposed: ['negotiating', 'cancelled', 'rejected'],
  negotiating: ['due_diligence', 'cancelled', 'rejected'],
  due_diligence: ['cancelled', 'rejected'],
  accepted: ['cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export const canTransitionDeal = (from, to) =>
  transitions[from]?.includes(to) ?? false;
