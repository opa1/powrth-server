import { Body, Controller, Patch, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { User } from '../generated/prisma/client'
import { UpdateProfileDto, updateProfileSchema } from './dto/update-profile.dto'
import { UserProfile, UsersService } from './users.service'

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  async updateMe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    const updated = await this.usersService.updateProfile(user.id, dto)
    return this.toUserProfile(updated)
  }

  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
    }
  }
}
