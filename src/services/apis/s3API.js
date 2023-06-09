import { getAWSCredentials } from "./config/awsCredentials";
import { awsS3Helper, MAX_CHUNCK_SIZE } from "./config/awsS3";

export const s3API = {
  bucketConfig: awsS3Helper.getBucketConfig(),

  s3Client: (() => {
    const credentials = getAWSCredentials()
    return awsS3Helper.initiateS3Client({ credentials })
  })(),

  async createNewBucket() {
    const pushBucketCommand = awsS3Helper.getCreateNewBucketCommand(this.bucketConfig)
    return awsS3Helper.sendS3Command(this.s3Client, pushBucketCommand)
  },

  async listBucketObjects(Prefix) {
    const DEFAULT_MAX_KEYS = 50
    const listCommandParams = { MaxKeys: DEFAULT_MAX_KEYS, ...this.bucketConfig }
    
    if(Prefix){
      listCommandParams.Prefix = Prefix
    }

    const listBucketObjectsCommand = awsS3Helper.getListBucketObjectsCommand(listCommandParams)
    try {
      const { Contents } = await awsS3Helper.sendS3Command(this.s3Client, listBucketObjectsCommand)
      return Contents || []
    } catch (error) {
      throw error
    }
  },

  async getDownloadObjectURLFromBucket(objectKey){
    try {
      const downloadParams = { Key: objectKey, ...this.bucketConfig }
      return awsS3Helper.createPresignedGetUrl(this.s3Client,downloadParams)
    } catch (error) {
      throw error
    }
  },

  async deleteObjectFromBucket(objectKey) {
    try {
      const deleteParams = { Key: objectKey, ...this.bucketConfig }
      const deleteCommand = awsS3Helper.getDeleteObjectCommand(deleteParams)
      return await awsS3Helper.sendS3Command(this.s3Client, deleteCommand)
    } catch (error) {
      throw error
    }
  },
  
  async uploadCommonObjectToBucket(s3object) {
    try {
      const uploadParams = { Key: s3object.name, ...this.bucketConfig, Body: s3object }
      const uploadCommand = awsS3Helper.getPutObjectCommand(uploadParams)
      return await awsS3Helper.sendS3Command(this.s3Client, uploadCommand)
    } catch (error) {
      throw error
    }
  },

  async uploadLargeObjectToBucket(s3object) {

    const bucketParams = { Key: s3object.name, ...this.bucketConfig }

    try {
      let uploadPromises = []
      const numberOfFragments = Math.ceil(s3object.size / MAX_CHUNCK_SIZE);

      const initiateMultipartUploadCommand = awsS3Helper.getCreateMultipartUploadCommand(bucketParams)
      const multipartUpload = await awsS3Helper.sendS3Command(this.s3Client, initiateMultipartUploadCommand)
      bucketParams.UploadId = multipartUpload.UploadId

      for (let idx = 0; idx < numberOfFragments; idx++) {
        const fragmentStart = idx * MAX_CHUNCK_SIZE;
        const fragmentEnd = fragmentStart + MAX_CHUNCK_SIZE;

        const fragmentUploadParams = {
          ...bucketParams,
          Body: s3object.slice(fragmentStart, fragmentEnd),
          PartNumber: idx + 1,
        }
        const partialUploadCommand = awsS3Helper.getUploadPartCommand(fragmentUploadParams);
        uploadPromises.push(awsS3Helper.sendS3Command(this.s3Client, partialUploadCommand))
      }

      const uploadResults = await Promise.all(uploadPromises);

      const completedUploadParams = {
        ...bucketParams,
        MultipartUpload: {
          Parts: uploadResults.map(({ ETag }, i) => ({
            ETag,
            PartNumber: i + 1,
          })),
        },
      }

      const completeMultipartUploadCommand = awsS3Helper.getCompleteMultipartUploadCommand(completedUploadParams)
      return await awsS3Helper.sendS3Command(this.s3Client, completeMultipartUploadCommand)

    } catch (error) {

      if (bucketParams.UploadId) {
        const abortCommand = awsS3Helper.getAbortMultipartUploadCommand(bucketParams)
        await awsS3Helper.sendS3Command(this.s3Client, abortCommand);
      }
      throw error
    }
  },

}