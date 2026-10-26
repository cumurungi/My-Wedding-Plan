import session from 'express-session';
import type { RowDataPacket } from 'mysql2';
import { pool } from './db.js';

type StoredSessionRow = RowDataPacket & { data: string; expiresAt: Date };
type StoreCallback = (error?: Error | null, value?: session.SessionData | null) => void;

export class MySQLSessionStore extends session.Store {
  override get(sid: string, callback: StoreCallback): void {
    void this.read(sid, callback);
  }

  private async read(sid: string, callback: StoreCallback): Promise<void> {
    try {
      const [rows] = await pool.query<StoredSessionRow[]>(
        'SELECT data FROM sessions WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP(3)', [sid],
      );
      callback(null, rows[0] ? JSON.parse(rows[0].data) as session.SessionData : null);
    } catch (error) { callback(error as Error); }
  }

  override set(sid: string, value: session.SessionData, callback?: (error?: Error | null) => void): void {
    void this.write(sid, value, callback);
  }

  private async write(sid: string, value: session.SessionData, callback?: (error?: Error | null) => void): Promise<void> {
    try {
      const expiresAt = value.cookie.expires
        ? new Date(value.cookie.expires)
        : new Date(Date.now() + (value.cookie.maxAge ?? 24 * 60 * 60 * 1000));
      await pool.execute(
        `INSERT INTO sessions (session_id, expires_at, data) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), data = VALUES(data)`,
        [sid, expiresAt, JSON.stringify(value)],
      );
      callback?.(null);
    } catch (error) { callback?.(error as Error); }
  }

  override destroy(sid: string, callback?: (error?: Error | null) => void): void {
    void pool.execute('DELETE FROM sessions WHERE session_id = ?', [sid])
      .then(() => callback?.(null))
      .catch((error: Error) => callback?.(error));
  }

  override touch(sid: string, value: session.SessionData, callback?: (error?: Error | null) => void): void {
    const expiresAt = value.cookie.expires
      ? new Date(value.cookie.expires)
      : new Date(Date.now() + (value.cookie.maxAge ?? 24 * 60 * 60 * 1000));
    void pool.execute('UPDATE sessions SET expires_at = ? WHERE session_id = ?', [expiresAt, sid])
      .then(() => callback?.(null))
      .catch((error: Error) => callback?.(error));
  }
}
