import { requireUser } from './backend';
import type {Dashboard} from './d1-store';
export {sessionCookie} from './backend';
export async function requirePanel(admin=false,dashboard:Dashboard='survey'){return (await requireUser(admin,dashboard)).profile;}
