'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputWithLabel } from '@/components/shared/forms/input-with-label'
import { Widget, WidgetBody, WidgetHead } from '@/components/ui/widget'

interface OrganizationForm {
  name: string
  timezone: string
}

export function OrganizationSettings() {
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState, reset } = useForm<OrganizationForm>({
    defaultValues: {
      name: 'My Organization',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  })

  const onSubmit = async (data: OrganizationForm) => {
    setIsLoading(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      toast.success('Organization updated', {
        description: 'Your organization settings have been saved.',
      })

      reset(data)
    } catch (error) {
      toast.error('Failed to update organization')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="max-w-screen-sm space-y-6">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Widget>
          <WidgetHead>
            <span className="title">Organization Details</span>
          </WidgetHead>
          <WidgetBody className="space-y-4">
            <InputWithLabel
              label="Organization Name"
              placeholder="Enter organization name"
              {...register('name', { required: 'Organization name is required' })}
              error={formState.errors.name?.message}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Timezone
              </label>
              <select
                {...register('timezone')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {Intl.supportedValuesOf('timeZone').slice(0, 50).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={!formState.isDirty || isLoading}
              >
                {isLoading && <Loader2 className="animate-spin" />}
                Save Changes
              </Button>
            </div>
          </WidgetBody>
        </Widget>
      </form>

      <Widget>
        <WidgetHead>
          <span className="title">Danger Zone</span>
        </WidgetHead>
        <WidgetBody>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">
                Delete Organization
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete this organization and all of its data. This action cannot be undone.
              </p>
              <Button variant="destructive" size="sm">
                Delete Organization
              </Button>
            </div>
          </div>
        </WidgetBody>
      </Widget>
    </section>
  )
}
