import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const Guess = z.object({
  media_type: z.enum(["movie", "tv"]),
  title: z.string().describe("Título más conocido, idealmente el original"),
  year: z.number().int().nullable().describe("Año de estreno de la película o de la serie"),
  season: z.number().int().nullable(),
  episode: z.number().int().nullable(),
  confidence: z.enum(["alta", "media", "baja"]),
  reason: z.string().describe("Una frase: qué del diálogo te hizo pensar en esto"),
});

const Result = z.object({
  candidates: z.array(Guess).describe("De 0 a 3 candidatos, el más probable primero"),
});

export type Candidate = z.infer<typeof Guess>;

const SYSTEM = `Identificas series y películas a partir de un fragmento de diálogo transcrito por el micrófono de un teléfono mientras el usuario mira la TV o una plataforma de streaming.

La transcripción puede tener errores, mezclar idiomas o estar doblada al español. Usa nombres de personajes, lugares, frases célebres, jerga y el tema de la conversación.

Devuelve hasta 3 candidatos ordenados por probabilidad. Indica temporada y capítulo solo si el diálogo te permite reconocer la escena concreta; si no, déjalos en null. Usa confidence "alta" solo si un nombre propio o una frase lo identifica sin duda. Si el texto es genérico o no reconoces nada, devuelve una lista vacía: es mejor no responder que inventar.`;

export function identifyConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function identifyFromTranscript(transcript: string): Promise<Candidate[]> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Result) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Transcripción:\n"""${transcript}"""` }],
  });
  if (response.stop_reason === "refusal") return [];
  return response.parsed_output?.candidates ?? [];
}
