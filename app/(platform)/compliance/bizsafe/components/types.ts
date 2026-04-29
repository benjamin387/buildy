import type {
  BizsafeApplicationStatus,
  BizsafeDocumentType,
  BizsafeLevel,
  TaskPriority,
} from "@prisma/client";

export type BizsafeProfileDto = {
  id: string;
  companyName: string;
  uen: string | null;
  currentLevel: BizsafeLevel;
  certificateNumber: string | null;
  approvalDate: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  status: BizsafeApplicationStatus;
  seniorManagementName: string | null;
  seniorManagementEmail: string | null;
  seniorManagementPhone: string | null;
  rmChampionName: string | null;
  rmChampionEmail: string | null;
  rmChampionPhone: string | null;
  auditorName: string | null;
  auditCompany: string | null;
  auditDate: string | null;
  auditReportExpiryDate: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BizsafeDocumentDto = {
  id: string;
  bizsafeProfileId: string;
  documentType: BizsafeDocumentType;
  title: string;
  fileUrl: string | null;
  fileName: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  remarks: string | null;
};

export type BizsafeTaskDto = {
  id: string;
  bizsafeProfileId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  priority: TaskPriority;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BizsafeTrainingRecordDto = {
  id: string;
  bizsafeProfileId: string;
  courseName: string;
  courseLevel: BizsafeLevel | null;
  attendeeName: string;
  attendeeRole: string | null;
  providerName: string | null;
  courseDate: string | null;
  completionDate: string | null;
  certificateUrl: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BizsafeDashboardData = {
  profile: BizsafeProfileDto;
  documents: BizsafeDocumentDto[];
  tasks: BizsafeTaskDto[];
  trainingRecords: BizsafeTrainingRecordDto[];
};

