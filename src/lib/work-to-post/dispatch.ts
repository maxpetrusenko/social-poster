export type LocalDispatchAction = "simulated_scheduled" | "simulated_published" | "denied";
export interface DispatchAdapter {
  dispatch(input: { workspaceId: string; candidateId: string; action: LocalDispatchAction; idempotencyKey: string }): Promise<{ dispatchId: string; action: LocalDispatchAction }>;
}

export function createFakeDispatchAdapter(create: (workspaceId: string, candidateId: string, action: LocalDispatchAction, approvalDigest: string) => Promise<string>): DispatchAdapter {
  return {
    async dispatch(input) {
      return { dispatchId: await create(input.workspaceId, input.candidateId, input.action, input.idempotencyKey), action: input.action };
    },
  };
}
