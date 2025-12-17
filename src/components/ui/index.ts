/**
 * UI Components Index
 * Barrel export for all UI components
 */

// Core components
export { Button, IconButton } from './button';
export type { ButtonProps, IconButtonProps } from './button';

export { Input, Textarea } from './input';
export type { InputProps, TextareaProps } from './input';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';
export type { CardProps, CardHeaderProps } from './card';

export { Avatar, AvatarGroup } from './avatar';
export type { AvatarProps, AvatarGroupProps } from './avatar';

// Feedback components
export { ToastProvider, useToast, toast } from './toast';
export type { ToastType } from './toast';

export { Modal, ConfirmModal, ModalFooter } from './modal';
export type { ModalProps, ConfirmModalProps } from './modal';

export { Alert } from './alert';
export type { AlertProps } from './alert';

export { Badge, BadgeGroup } from './badge';
export type { BadgeProps, BadgeGroupProps } from './badge';

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  EmailRowSkeleton,
  EmailListSkeleton,
  EmailDetailSkeleton,
  CardSkeleton,
  AvatarSkeleton,
} from './skeleton';
export type {
  SkeletonProps,
  SkeletonTextProps,
  SkeletonAvatarProps,
  SkeletonButtonProps,
  SkeletonCardProps,
} from './skeleton';

export { Spinner, LoadingOverlay } from './spinner';
export type { SpinnerProps, LoadingOverlayProps } from './spinner';
