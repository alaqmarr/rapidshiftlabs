export interface EncryptionService {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
}
