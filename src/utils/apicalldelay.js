import { config } from "dotenv";

config();

const API_CALL_DELAY = process.env.APICALL_DELAY || 25;

export { API_CALL_DELAY };