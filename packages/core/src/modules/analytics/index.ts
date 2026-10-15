import { DrizzleAnalyticsRepository } from "./infrastructure/repositories/drizzle-analytics.repository";
import type { IAnalyticsRepository } from "./domain/ports/analytics-repository.port";
import { RecordEventBatchUseCase } from "./application/use-cases/record-event-batch.usecase";
import { GetAnalyticsOverviewUseCase } from "./application/use-cases/get-analytics-overview.usecase";
import { GetTimeseriesUseCase } from "./application/use-cases/get-timeseries.usecase";
import { GetWebVitalsUseCase } from "./application/use-cases/get-web-vitals.usecase";
import { ExportAnalyticsUseCase } from "./application/use-cases/export-analytics.usecase";
import { ManageOffloadConfigUseCase } from "./application/use-cases/manage-offload-config.usecase";

// Domain exports
export * from "./domain/services/visitor-hasher";
export * from "./domain/entities/analytics-event.entity";
export * from "./domain/ports/analytics-repository.port";

// Application exports
export * from "./application/dtos/analytics.dto";
export * from "./application/use-cases/record-event-batch.usecase";
export * from "./application/use-cases/get-analytics-overview.usecase";
export * from "./application/use-cases/get-timeseries.usecase";
export * from "./application/use-cases/get-web-vitals.usecase";
export * from "./application/use-cases/export-analytics.usecase";
export * from "./application/use-cases/manage-offload-config.usecase";

// Infrastructure exports
export * from "./infrastructure/repositories/drizzle-analytics.repository";

export interface AnalyticsModuleDependencies {
  analyticsRepo?: IAnalyticsRepository;
}

export class AnalyticsModule {
  public readonly repo: IAnalyticsRepository;

  public readonly recordEventBatchUseCase: RecordEventBatchUseCase;
  public readonly getOverviewUseCase: GetAnalyticsOverviewUseCase;
  public readonly getTimeseriesUseCase: GetTimeseriesUseCase;
  public readonly getWebVitalsUseCase: GetWebVitalsUseCase;
  public readonly exportAnalyticsUseCase: ExportAnalyticsUseCase;
  public readonly manageOffloadConfigUseCase: ManageOffloadConfigUseCase;

  constructor(deps?: AnalyticsModuleDependencies) {
    this.repo = deps?.analyticsRepo ?? new DrizzleAnalyticsRepository();

    this.recordEventBatchUseCase = new RecordEventBatchUseCase(this.repo);
    this.getOverviewUseCase = new GetAnalyticsOverviewUseCase(this.repo);
    this.getTimeseriesUseCase = new GetTimeseriesUseCase(this.repo);
    this.getWebVitalsUseCase = new GetWebVitalsUseCase(this.repo);
    this.exportAnalyticsUseCase = new ExportAnalyticsUseCase(this.repo);
    this.manageOffloadConfigUseCase = new ManageOffloadConfigUseCase(this.repo);
  }
}

let analyticsModuleInstance: AnalyticsModule | null = null;

export function getAnalyticsModule(deps?: AnalyticsModuleDependencies): AnalyticsModule {
  if (!analyticsModuleInstance || deps) {
    analyticsModuleInstance = new AnalyticsModule(deps);
  }
  return analyticsModuleInstance;
}
