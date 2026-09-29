// `revalidate` route segment config hai — build ke waqt statically padha
// jaata hai, isliye re-export se nahi aata. Handler re-export theek hai.
export { GET } from "../../../../src/app/api/mukul/videos/route";

export const revalidate = 3600;
