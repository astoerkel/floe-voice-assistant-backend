# -*- coding: utf-8 -*- #
# Copyright 2020 Google LLC. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Code for making shared messages between commands."""

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals


def GetSuccessMessageForMultiRegionSynchronousDeploy(service, regions):
  """Returns a user message for a successful synchronous deploy.

  Args:
    service: googlecloudsdk.api_lib.run.service.Service, Deployed service for
      which to build a success message.
    regions: list of regions that we deployed to.
  """
  msg = (
      'Multi-Region Service [{{bold}}{s}{{reset}}] '
      'has been deployed to regions {{bold}}{r}{{reset}}.'
      '\nRegional URLs:'
  ).format(
      s=service.name,
      r=regions,
  )
  for region in regions:
    condition = 'MultiRegionReady/' + region
    url = (
        service.conditions[condition].get('message')
        if condition in service.conditions
        else ''
    )
    msg += '\n{{bold}}{url}{{reset}} ({{bold}}{r}{{reset}})'.format(
        r=region, url=url
    )
  return msg


def GetSuccessMessageForSynchronousDeploy(service, no_traffic):
  """Returns a user message for a successful synchronous deploy.

  Args:
    service: googlecloudsdk.api_lib.run.service.Service, Deployed service for
      which to build a success message.
    no_traffic: bool, whether the service was deployed with --no-traffic flag.
  """
  latest_ready = service.status.latestReadyRevisionName
  # Use lastCreatedRevisionName if --no-traffic is set. This was due to a bug
  # where the latestReadyRevisionName was not updated in time when traffic
  # update was not needed in reconciliation steps.
  latest_created = service.status.latestCreatedRevisionName
  latest_percent_traffic = 0 if no_traffic else service.latest_percent_traffic
  msg = (
      'Service [{{bold}}{serv}{{reset}}] '
      'revision [{{bold}}{rev}{{reset}}] '
      'has been deployed and is serving '
      '{{bold}}{latest_percent_traffic}{{reset}} percent of traffic.'
  )
  if latest_percent_traffic:
    msg += '\nService URL: {{bold}}{url}{{reset}}'
  latest_url = service.latest_url
  tag_url_message = ''
  if latest_url:
    tag_url_message = '\nThe revision can be reached directly at {}'.format(
        latest_url
    )
  return (
      msg.format(
          serv=service.name,
          rev=latest_created if no_traffic else latest_ready,
          url=service.domain,
          latest_percent_traffic=latest_percent_traffic,
      )
      + tag_url_message
  )


def GetStartDeployMessage(
    conn_context,
    resource_ref,
    operation='Deploying container to',
    resource_kind_lower='service',
):
  """Returns a user mesage for starting a deploy.

  Args:
    conn_context: connection_context.ConnectionInfo, Metadata for the run API
      client.
    resource_ref: protorpc.messages.Message, A resource reference object for the
      resource. See googlecloudsdk.core.resources.Registry.ParseResourceId for
      details.
    operation: str, what deploy action is being done.
    resource_kind_lower: str, resource kind being deployed, e.g. "service"
  """
  msg = (
      '{operation} {operator} {resource_kind} '
      '[{{bold}}{resource}{{reset}}] in {ns_label} [{{bold}}{ns}{{reset}}]'
  )
  msg += conn_context.location_label
  # For WorkerPools case resource_ref.Parent().Name() returns the region name
  # which is not what we want.
  ns = (
      resource_ref.projectsId
      if resource_kind_lower == 'worker pool'
      else resource_ref.Parent().Name()
  )
  return msg.format(
      operation=operation,
      operator=conn_context.operator,
      resource_kind=resource_kind_lower,
      ns_label=conn_context.ns_label,
      resource=resource_ref.Name(),
      ns=ns,
  )


def GetNotFoundMessage(conn_context, resource_ref, resource_kind='Service'):
  """Returns a user mesage for resource not found.

  Args:
    conn_context: connection_context.ConnectionInfo, Metadata for the run API
      client.
    resource_ref: protorpc.messages.Message, A resource reference object for the
      resource. See googlecloudsdk.core.resources.Registry.ParseResourceId for
      details.
    resource_kind: str, resource kind, e.g. "Service"
  """
  msg = (
      '{resource_kind} [{resource}] could not be found'
      ' in {ns_label} [{ns}] region [{region}].'
  )

  return msg.format(
      resource_kind=resource_kind,
      resource=resource_ref.Name(),
      ns_label=conn_context.ns_label,
      ns=resource_ref.Parent().Name(),
      region=conn_context.region,
  )


def GetRunJobMessage(release_track, job_name, repeat=False):
  """Returns a user message for how to run a job."""
  return (
      '\nTo execute this job{repeat}, use:\n'
      'gcloud{release_track} run jobs execute {job_name}'.format(
          repeat=' again' if repeat else '',
          release_track=(
              ' {}'.format(release_track.prefix)
              if release_track.prefix is not None
              else ''
          ),
          job_name=job_name,
      )
  )


def GetExecutionCreatedMessage(release_track, execution):
  """Returns a user message with execution details when running a job."""
  msg = (
      '\nView details about this execution by running:\n'
      'gcloud{release_track} run jobs executions describe {execution_name}'
  ).format(
      release_track=(
          ' {}'.format(release_track.prefix)
          if release_track.prefix is not None
          else ''
      ),
      execution_name=execution.name,
  )
  if execution.status and execution.status.logUri:
    msg += '\n\nOr visit ' + _GetExecutionUiLink(execution)
  return msg


def _GetExecutionUiLink(execution):
  return (
      'https://console.cloud.google.com/run/jobs/executions/'
      'details/{region}/{execution_name}/tasks?project={project}'
  ).format(
      region=execution.region,
      execution_name=execution.name,
      project=execution.namespace,
  )


def GetBuildEquivalentForSourceRunMessage(name, pack, source, subgroup=''):
  """Returns a user message for equivalent gcloud commands for source deploy.

  Args:
    name: name of the source target, which is either a service, a job or a
      worker
    pack: the pack arguments used to build the container image
    source: the location of the source
    subgroup: subgroup name for this command. Either 'jobs ', 'workers ' or
      empty for services
  """
  build_flag = '--pack image=[IMAGE]' if pack else '--tag [IMAGE]'
  msg = (
      'This command is equivalent to running '
      '`gcloud builds submit {build_flag} {source}` and '
      '`gcloud run {subgroup}deploy {name} --image [IMAGE]`\n'
  )
  return msg.format(
      name=name, build_flag=build_flag, source=source, subgroup=subgroup
  )
