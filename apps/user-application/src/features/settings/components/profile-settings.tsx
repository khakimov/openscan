'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputWithLabel } from '@/components/shared/forms/input-with-label'
import { Widget, WidgetBody, WidgetHead } from '@/components/ui/widget'

interface ProfileSettingsProps {
  user: any
}

interface ProfileForm {
  firstName: string
  lastName: string
  email: string
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)

  const { register, handleSubmit, formState, reset } = useForm<ProfileForm>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: user?.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const onSubmitProfile = async (data: Partial<ProfileForm>) => {
    setIsLoading(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      toast.success('Profile updated', {
        description: 'Your profile has been updated successfully.',
      })

      reset({
        ...data,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitPassword = async (data: Pick<ProfileForm, 'currentPassword' | 'newPassword' | 'confirmPassword'>) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setIsPasswordLoading(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      toast.success('Password updated', {
        description: 'Your password has been changed successfully.',
      })

      reset((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }))
    } catch (error) {
      toast.error('Failed to update password')
    } finally {
      setIsPasswordLoading(false)
    }
  }

  return (
    <section className="max-w-screen-sm space-y-6">
      {/* Profile Information */}
      <form onSubmit={handleSubmit(onSubmitProfile)}>
        <Widget>
          <WidgetHead>
            <span className="title">Profile Information</span>
          </WidgetHead>
          <WidgetBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputWithLabel
                label="First Name"
                placeholder="Enter your first name"
                {...register('firstName')}
                error={formState.errors.firstName?.message}
              />
              <InputWithLabel
                label="Last Name"
                placeholder="Enter your last name"
                {...register('lastName')}
                error={formState.errors.lastName?.message}
              />
            </div>

            <InputWithLabel
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^\S+@\S+$/i,
                  message: 'Invalid email address',
                }
              })}
              error={formState.errors.email?.message}
            />

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={!formState.isDirty || isLoading}
              >
                {isLoading && <Loader2 className="animate-spin" />}
                Save Profile
              </Button>
            </div>
          </WidgetBody>
        </Widget>
      </form>

      {/* Change Password */}
      <form onSubmit={handleSubmit(onSubmitPassword)}>
        <Widget>
          <WidgetHead>
            <span className="title">Change Password</span>
          </WidgetHead>
          <WidgetBody className="space-y-4">
            <InputWithLabel
              label="Current Password"
              type="password"
              placeholder="Enter your current password"
              {...register('currentPassword', { required: 'Current password is required' })}
              error={formState.errors.currentPassword?.message}
            />

            <InputWithLabel
              label="New Password"
              type="password"
              placeholder="Enter your new password"
              {...register('newPassword', {
                required: 'New password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters',
                }
              })}
              error={formState.errors.newPassword?.message}
            />

            <InputWithLabel
              label="Confirm New Password"
              type="password"
              placeholder="Confirm your new password"
              {...register('confirmPassword', { required: 'Please confirm your password' })}
              error={formState.errors.confirmPassword?.message}
            />

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={isPasswordLoading}
                variant="secondary"
              >
                {isPasswordLoading && <Loader2 className="animate-spin" />}
                Update Password
              </Button>
            </div>
          </WidgetBody>
        </Widget>
      </form>

      {/* Account Actions */}
      <Widget>
        <WidgetHead>
          <span className="title">Account Actions</span>
        </WidgetHead>
        <WidgetBody>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">
                Export Data
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Download a copy of your account data.
              </p>
              <Button variant="outline" size="sm">
                Export Data
              </Button>
            </div>

            <hr className="border-border" />

            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">
                Delete Account
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button variant="destructive" size="sm">
                Delete Account
              </Button>
            </div>
          </div>
        </WidgetBody>
      </Widget>
    </section>
  )
}
