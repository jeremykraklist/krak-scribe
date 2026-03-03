import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || "krak-scribe-dev-secret-change-me";
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function createUser(
  email: string,
  password: string,
  name?: string
) {
  const passwordHash = await hashPassword(password);
  const id = uuidv4();
  const now = new Date().toISOString();

  const [user] = await db
    .insert(users)
    .values({
      id,
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return user;
}

export async function authenticateUser(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return user;
}

export function getUserIdFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  return payload?.userId || null;
}
