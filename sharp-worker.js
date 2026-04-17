const fs = require('fs');
const path = require('path');

// Worker script to run sharp using the system's Node.js
// This avoids Electron Node.js compatibility issues

async function main() {
    try {
        const sharp = require('sharp');
        
        // Parse arguments
        const args = process.argv.slice(2);
        if (args.length < 1) {
            console.error('Usage: node sharp-worker.js <action> [options...]');
            process.exit(1);
        }

        const action = args[0];

        if (action === 'test') {
            // Test action
            const buffer = await sharp({
                create: {
                    width: 100,
                    height: 100,
                    channels: 4,
                    background: { r: 255, g: 0, b: 0, alpha: 1 }
                }
            }).png().toBuffer();
            
            console.log(JSON.stringify({
                success: true,
                version: sharp.versions.sharp,
                size: buffer.length
            }));
            return;
        }

        if (action === 'optimize') {
            const input = args[1];
            const output = args[2];
            const ext = args[3];
            const quality = parseInt(args[4], 10);

            if (!fs.existsSync(input)) {
                throw new Error(`Input file not found: ${input}`);
            }

            let sharpInstance = sharp(input);

            if (ext === '.png') {
                await sharpInstance.png({ 
                    quality: quality,
                    compressionLevel: 9,
                    adaptiveFiltering: true
                }).toFile(output);
            } else if (ext === '.jpg' || ext === '.jpeg') {
                await sharpInstance.jpeg({ 
                    quality: quality,
                    progressive: true,
                    mozjpeg: true
                }).toFile(output);
            } else if (ext === '.webp') {
                await sharpInstance.webp({ 
                    quality: quality
                }).toFile(output);
            } else {
                throw new Error(`Unsupported extension: ${ext}`);
            }

            console.log(JSON.stringify({
                success: true,
                input: input,
                output: output
            }));
            return;
        }

        throw new Error(`Unknown action: ${action}`);

    } catch (err) {
        console.log(JSON.stringify({
            success: false,
            error: err.message,
            stack: err.stack
        }));
        process.exit(0); // Exit 0 so we can still parse the JSON error
    }
}

main();