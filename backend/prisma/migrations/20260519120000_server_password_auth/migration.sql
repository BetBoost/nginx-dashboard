-- Allow password-based SSH auth: make privateKeyEnc optional, add passwordEnc.
ALTER TABLE "Server" ALTER COLUMN "privateKeyEnc" DROP NOT NULL;
ALTER TABLE "Server" ADD COLUMN "passwordEnc" TEXT;
