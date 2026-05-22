import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'growwatch-dev-secret-change-in-prod';

export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
}

export const signToken = (payload: JwtPayload): string =>
    jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

export const verifyToken = (token: string): JwtPayload =>
    jwt.verify(token, JWT_SECRET) as JwtPayload;

export const hashPassword = (password: string): Promise<string> =>
    bcrypt.hash(password, 12);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
    bcrypt.compare(password, hash);
