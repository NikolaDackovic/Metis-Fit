import type { TestProject } from 'vitest/node';
import { startTestServer } from '../src/testing';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const server = await startTestServer();
  project.provide('pgAdminUrl', server.adminUrl);
  return async () => server.stop();
}
