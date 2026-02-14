import { PrismaClient } from "@prisma/client";
import path from "path";
import { promises as fs } from "fs";
import { v2 as cloudinary } from "cloudinary";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

export class FileManager {
  static async normal(file) {
    const setting = await prisma.generalSetting.findUnique({
      where: { id: 1 },
    });
    if (!setting) throw new Error("GeneralSetting not found");
    if (setting.file_storage_type === "cloudinary") {
      return await FileManager.cloudinary(file);
    } else {
      return await FileManager.local(file);
    }
  }

  static async local(file) {
    // file: { url } expected from junk
    const junkDir = path.resolve(process.cwd(), "public", "junk");
    const publicDir = path.resolve(process.cwd(), "public", "uploads");
    try {
      await fs.mkdir(publicDir, { recursive: true });
    } catch (err) {}
    // Extract filename from url
    const urlParts = file.url.split("/");
    const filename = urlParts[urlParts.length - 1];
    const junkPath = path.join(junkDir, filename);
    const destPath = path.join(publicDir, filename);
    // Check if file exists in junk
    try {
      await fs.access(junkPath);
    } catch {
      throw new Error("File not found in junk directory");
    }
    // Move file from junk to public
    await fs.rename(junkPath, destPath);
    return { url: `${process.env.BASE_URL}/public/uploads/${filename}` };
  }

  static async Temp(file) {
    const uploadDir = path.resolve(process.cwd(), "public", "junk");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch {}
    const uniqueName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
    const filePath = path.join(uploadDir, uniqueName);
    await fs.writeFile(filePath, file.buffer);
    return { url: `${process.env.BASE_URL}/public/junk/${uniqueName}` };
  }

  static async cloudinary(file) {
    // file: { url } expected from junk
    const setting = await prisma.generalSetting.findUnique({
      where: { id: 1 },
    });
    if (!setting) throw new Error("GeneralSetting not found");
    if (
      !setting.cloudinary_cloud_name ||
      !setting.cloudinary_api_key ||
      !setting.cloudinary_api_secret
    ) {
      throw new Error("Cloudinary credentials missing in GeneralSetting");
    }
    cloudinary.config({
      cloud_name: setting.cloudinary_cloud_name,
      api_key: setting.cloudinary_api_key,
      api_secret: setting.cloudinary_api_secret,
    });
    const junkDir = path.resolve(process.cwd(), "public", "junk");
    // Extract filename from url
    const urlParts = file.url.split("/");
    const filename = urlParts[urlParts.length - 1];
    const junkPath = path.join(junkDir, filename);
    // Check if file exists in junk
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(junkPath);
    } catch {
      throw new Error("File not found in junk directory");
    }
    // Upload to cloudinary
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder: "uploads",
        },
        async (error, result) => {
          // Delete from junk after upload attempt
          await fs.unlink(junkPath).catch(() => {});
          if (error) return reject(error);
          resolve({ url: result.secure_url });
        },
      );
      stream.end(fileBuffer);
    });
  }

  static async delete(fileUrl) {
    if (!fileUrl) throw new Error("No file URL provided");
    const isLocal = fileUrl.includes(process.env.BASE_URL);
    if (isLocal) {
      // Local file: extract filename and delete from public dir
      const urlParts = fileUrl.split("/");
      const filename = urlParts[urlParts.length - 1];
      const publicDir = path.resolve(process.cwd(), "public");
      const filePath = path.join(publicDir, filename);
      try {
        await fs.unlink(filePath);
        return { success: true, message: "Deleted from local storage" };
      } catch (err) {
        if (err.code === "ENOENT") {
          return { success: false, message: "File not found in local storage" };
        }
        throw err;
      }
    } else {
      // Cloudinary file: extract public_id and delete
      // Example Cloudinary URL: https://res.cloudinary.com/<cloud_name>/.../uploads/<public_id>.<ext>
      // We need to extract the public_id (path after /uploads/ and before extension)
      const uploadsIdx = fileUrl.indexOf("/uploads/");
      if (uploadsIdx === -1) {
        throw new Error("Not a recognized Cloudinary uploads URL");
      }
      let publicIdWithExt = fileUrl.substring(uploadsIdx + 9); // after '/uploads/'
      // Remove extension
      const dotIdx = publicIdWithExt.lastIndexOf(".");
      const publicId =
        dotIdx !== -1 ? publicIdWithExt.substring(0, dotIdx) : publicIdWithExt;

      // Get cloudinary credentials from settings
      const setting = await prisma.generalSetting.findUnique({
        where: { id: 1 },
      });
      if (!setting) throw new Error("GeneralSetting not found");
      if (
        !setting.cloudinary_cloud_name ||
        !setting.cloudinary_api_key ||
        !setting.cloudinary_api_secret
      ) {
        throw new Error("Cloudinary credentials missing in GeneralSetting");
      }
      cloudinary.config({
        cloud_name: setting.cloudinary_cloud_name,
        api_key: setting.cloudinary_api_key,
        api_secret: setting.cloudinary_api_secret,
      });
      try {
        const result = await cloudinary.uploader.destroy(
          `uploads/${publicId}`,
          { resource_type: "auto" },
        );
        if (result.result === "ok" || result.result === "not found") {
          return {
            success: true,
            message: `Deleted from Cloudinary: ${result.result}`,
          };
        } else {
          return {
            success: false,
            message: `Cloudinary delete failed: ${result.result}`,
          };
        }
      } catch (err) {
        throw new Error("Cloudinary delete error: " + err.message);
      }
    }
  }
}
