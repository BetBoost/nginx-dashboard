import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Matches } from 'class-validator';

export class InstallPackageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @Matches(/^[a-z0-9][a-z0-9+\-.:]{0,127}$/i, { each: true, message: 'invalid package name' })
  packages!: string[];
}

export class RemovePackageDto extends InstallPackageDto {
  @IsOptional()
  purge?: boolean;
}

export class ListPackagesDto {
  @IsOptional()
  @IsString()
  q?: string;
}
