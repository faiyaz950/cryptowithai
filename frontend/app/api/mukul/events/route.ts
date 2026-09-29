// Next route segment config (`runtime`, `revalidate`) build ke waqt padha
// jaata hai, isliye wo re-export se nahi aa sakta — use har route file mein
// khud likhna padta hai. Handlers re-export theek chalte hain.
export { GET, POST } from "../../../../src/app/api/mukul/events/route";

export const runtime = "nodejs";
