import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function macroRoutes(fastify: FastifyInstance) {
    // List all macros
    fastify.get("/", async (request, reply) => {
        try {
            const macros = await prisma.macro.findMany({
                orderBy: { createdAt: "desc" },
            });
            return macros;
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ error: "Failed to fetch macros" });
        }
    });

    // Create a new macro
    fastify.post("/", async (request, reply) => {
        const { name, content } = request.body as { name: string; content: string };
        try {
            const macro = await prisma.macro.create({
                data: {
                    name,
                    content,
                },
            });
            return macro;
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ error: "Failed to create macro" });
        }
    });

    // Update a macro
    fastify.put("/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const { name, content } = request.body as { name?: string; content?: string };
        try {
            const macro = await prisma.macro.update({
                where: { id: parseInt(id) },
                data: {
                    name,
                    content,
                },
            });
            return macro;
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ error: "Failed to update macro" });
        }
    });

    // Delete a macro
    fastify.delete("/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            await prisma.macro.delete({
                where: { id: parseInt(id) },
            });
            return { success: true };
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ error: "Failed to delete macro" });
        }
    });
}
