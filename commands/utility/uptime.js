module.exports = (app) => {
    app.command("/uptime", async ({ ack, respond }) => {
        await ack();
    
        const uptime = process.uptime();
        const days = Math.floor(uptime / (24 * 60 * 60));
        const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((uptime % (60 * 60)) / 60);
        const seconds = Math.floor(uptime % 60);
    
        await respond({
        response_type: "ephemeral",
        text: `:clock1: Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`,
        });
    });
    }
