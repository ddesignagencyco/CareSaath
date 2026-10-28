import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VisitStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

const CLOSED_VISIT_STATUSES: VisitStatus[] = [
  VisitStatus.COMPLETED,
  VisitStatus.CANCELLED,
  VisitStatus.DECLINED,
];

/**
 * Persistence + authorization for in-app calls. The backend never touches
 * media: audio/video is peer-to-peer WebRTC between the two apps; this is
 * only the signaling authorization + an audit trail (CallLog) of who called
 * whom, when, and for how long.
 */
@Injectable()
export class CallSignalingService {
  constructor(private readonly prisma: PrismaService) {}

  /** The two users must share an active (not yet closed) visit to call each other. */
  private async assertSharedActiveVisit(
    visitId: string,
    userId: string,
    otherUserId: string,
  ): Promise<void> {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        status: { notIn: CLOSED_VISIT_STATUSES },
        booking: {
          OR: [
            { customerId: userId, caregiver: { userId: otherUserId } },
            { customerId: otherUserId, caregiver: { userId: userId } },
          ],
        },
      },
      select: { id: true },
    });
    if (!visit) {
      throw new BadRequestException('No active visit shared with that user');
    }
  }

  async startCall(visitId: string, callerId: string, calleeId: string) {
    await this.assertSharedActiveVisit(visitId, callerId, calleeId);
    return this.prisma.callLog.create({
      data: { visitId, callerId, calleeId, status: 'INITIATED' },
    });
  }

  /** The call row, for routing a signaling message to the other participant. */
  async loadForRouting(callId: string, userId: string) {
    const call = await this.prisma.callLog.findUnique({ where: { id: callId } });
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      throw new NotFoundException('Call not found');
    }
    return call;
  }

  async markConnected(callId: string): Promise<void> {
    await this.prisma.callLog.update({ where: { id: callId }, data: { status: 'CONNECTED' } });
  }

  async markEnded(callId: string): Promise<void> {
    const call = await this.prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) return;
    const durationSec = Math.max(0, Math.round((Date.now() - call.startedAt.getTime()) / 1000));
    await this.prisma.callLog.update({
      where: { id: callId },
      data: { status: 'ENDED', endedAt: new Date(), durationSec },
    });
  }

  async markRejected(callId: string): Promise<void> {
    await this.prisma.callLog.update({
      where: { id: callId },
      data: { status: 'REJECTED', endedAt: new Date() },
    });
  }
}
