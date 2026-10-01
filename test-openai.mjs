import OpenAI from "openai";

console.log("1. Script started");

if (!process.env.OPENAI_API_KEY) {
  console.error("2. OPENAI_API_KEY is missing");
  process.exit(1);
}

console.log("2. API key detected");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

try {
  console.log("3. Sending request to OpenAI...");

  const response = await openai.responses.create({
    model: "gpt-6-luna",
    input: "Reply with exactly: API WORKING",
  });

  console.log("4. Response received");
  console.log("Output:", response.output_text);
} catch (error) {
  console.error("OPENAI ERROR:");
  console.error(error);
}
