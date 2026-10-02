'use client';

import { ATTEMPT_TOKEN_HEADER } from '@hbe/shared';
import { createContext, useContext } from 'react';

/**
 * Present while a question is solved inside a test attempt. The solve components then save
 * drafts to the attempt, send the attempt id + device token with runs/submits, and report
 * editor-level proctoring signals (large inserts) to the agent.
 */
export interface ExamCtx {
  attemptId: string;
  token: string;
  /** Called with a ProctorEvent type when the editor sees something worth logging. */
  report: (type: 'bulk_insert' | 'paste', data?: Record<string, string | number | boolean>) => void;
  /** Called when the server says this device may no longer act (replaced, closed). */
  onSessionError: (detail: string) => void;
  blockClipboard: boolean;
}

export const ExamContext = createContext<ExamCtx | null>(null);
export const useExam = () => useContext(ExamContext);
export const examHeaders = (e: ExamCtx) => ({ [ATTEMPT_TOKEN_HEADER]: e.token });
